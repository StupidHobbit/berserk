#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.25,1.0,length((p-c)/r));
}

void main() {
    vec4 original=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.1731)*6.2831853;
    // The subclass banner ends at .139; the first lower ornament starts .545.
    // A hard zero outside this inset keeps every printed pixel untouched.
    float art=smoothstep(0.145,0.163,p.y)*(1.0-smoothstep(0.526,0.542,p.y));
    art*=smoothstep(0.008,0.026,p.x)*(1.0-smoothstep(0.974,0.992,p.x));
    if(art<=0.0) { gl_FragColor=original; return; }
    vec3 color=original.rgb;
    float land=oval(p,vec2(0.494,0.452),vec2(0.475,0.132));
    float stone=oval(p,vec2(0.495,0.301),vec2(0.200,0.158));
    float warm=smoothstep(0.035,0.24,original.r-original.b);

    // Three borrowed landscapes pass through the island: bog cyan, forest
    // green, and desert amber. Narrow fronts travel with visible wind ribbons.
    float fronts=0.0;
    for(int i=0;i<3;i++) {
        float k=float(i);
        float age=fract(t*0.105+k/3.0+seed*0.05);
        float head=-0.10+1.20*age;
        float path=0.450+k*0.023-0.049*sin(p.x*3.14159265)
                  +0.009*sin(p.x*15.0-t*1.9+k*2.1);
        float dist=abs(p.y-path)*1.4113;
        float ribbon=1.0-smoothstep(0.002,0.007+aa,dist);
        float trail=smoothstep(head-0.28,head-0.035,p.x)
                    *(1.0-smoothstep(head,head+0.026,p.x));
        float life=smoothstep(0.0,0.11,age)*(1.0-smoothstep(0.85,1.0,age));
        vec3 element=mix(vec3(0.10,0.64,0.61),vec3(0.33,0.66,0.15),step(0.5,k));
        element=mix(element,vec3(1.0,0.48,0.07),step(1.5,k));
        color+=(1.0-color)*element*ribbon*trail*life*0.78;
        float headY=0.450+k*0.023-0.049*sin(head*3.14159265)
                   +0.009*sin(head*15.0-t*1.9+k*2.1);
        float d=length((p-vec2(head,headY))*vec2(1.0,1.4113));
        float bead=(1.0-smoothstep(0.004,0.009+aa,d))+0.30*exp(-d*75.0);
        color+=(1.0-color)*element*bead*life*0.70;
        fronts+=exp(-abs(p.x-head)*21.0)*life;
    }
    float terrainPhase=p.x*2.2-t*0.17+0.14*sin(p.y*21.0)+seed*0.06;
    vec3 terrainHue=0.5+0.5*cos(6.2831853*(terrainPhase+vec3(0.0,0.29,0.60)));
    color=mix(color,color*(0.72+terrainHue*0.57),land*fronts*0.50);

    // The painted cloud banks stream past the mountain, with two broad,
    // separated curls. Their movement stays readable on compact cards.
    for(int i=0;i<2;i++) {
        float k=float(i);
        float age=fract(t*0.073+k*0.5+seed*0.09);
        float cx=-0.19+1.38*age;
        float cy=0.339+k*0.151+0.012*sin(cx*8.0-t*0.8);
        vec2 q=(p-vec2(cx,cy))/vec2(0.20,0.025);
        float curl=exp(-q.x*q.x*1.4)*exp(-pow(q.y-0.45*sin(q.x*3.0+t),2.0)*3.0);
        float fade=smoothstep(0.0,0.12,age)*(1.0-smoothstep(0.84,1.0,age));
        color+=(1.0-color)*vec3(0.30,0.53,0.60)*curl*fade*0.33;
    }

    // Rainbow follows the original upper-right arc, with travelling glints
    // climbing towards its summit instead of a full-frame color pulse.
    vec2 rq=(p-vec2(0.443,0.371))*vec2(1.0,1.4113);
    float rr=length(rq);
    float rainbow=exp(-pow((rr-0.432)/0.018,2.0));
    rainbow*=smoothstep(0.61,0.69,p.x)*(1.0-smoothstep(0.322,0.352,p.y));
    float angle=atan(rq.y,rq.x);
    float sweep=pow(0.5+0.5*cos(angle*7.0+t*2.3+seed),6.0);
    vec3 rainbowHue=0.5+0.5*cos((rr-0.417)*165.0+vec3(0.0,2.1,4.2));
    color+=(1.0-color)*rainbowHue*rainbow*(0.16+0.57*sweep);

    // Sunlight climbs the actual gold rock faces as the borrowed land shifts.
    float climb=pow(0.5+0.5*sin(p.y*48.0+p.x*11.0+t*2.3+seed),8.0);
    color+=(1.0-color)*vec3(0.94,0.50,0.12)*stone*warm*climb*0.36;

    if(u_is_foil) {
        // Embossed topographic contour foil: broad metallic rainbow facets
        // remain apparent with time frozen, retaining the dark rock texture.
        float phase=p.x*1.7+p.y*2.8+0.13*sin(p.x*13.0+p.y*9.0)-t*0.14+seed*0.04;
        vec3 hue=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        vec3 overlay=mix(2.0*color*hue,1.0-2.0*(1.0-color)*(1.0-hue),step(vec3(0.5),color));
        float metal=clamp(0.32+land*0.52+stone*0.44,0.0,1.0);
        color=mix(color,overlay,0.44*metal);
        float contours=pow(0.5+0.5*sin(phase*42.0),13.0);
        float band=pow(0.5+0.5*cos(phase*6.2831853),8.0);
        color*=1.0-0.12*metal;
        color+=(1.0-color)*mix(vec3(0.92,0.67,0.26),hue,0.66)
              *metal*(0.16+0.45*band+0.18*contours);
    }
    gl_FragColor=vec4(mix(original.rgb,clamp(color,0.0,1.0),art),original.a);
}
