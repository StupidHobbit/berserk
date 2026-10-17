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

// Делиома: the flame held in her raised hand discharges into the burning
// branches; three travelling ward crescents represent her prevented wounds.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.65,1.0,length((p-c)/r));
}
float hash(float n) { return fract(sin(n*127.1+19.7)*43758.5453); }
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.0,1.0));
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 original=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=u_time;
    float seed=u_seed*0.173;
    float art=smoothstep(0.140,0.155,p.y)*(1.0-smoothstep(0.537,0.551,p.y));
    art*=smoothstep(0.008,0.025,p.x)*(1.0-smoothstep(0.976,0.993,p.x));
    // The shield badge includes its full gold rim and drop shadow.
    art*=smoothstep(1.04,1.18,length((p-vec2(0.109,0.181))/vec2(0.069,0.049)));
    vec3 color=original.rgb;
    vec2 palm=vec2(0.548,0.357);
    float face=oval(p,vec2(0.470,0.296),vec2(0.078,0.062));
    float figure=oval(p,vec2(0.475,0.407),vec2(0.160,0.185));
    float background=1.0-figure*0.92;

    // Broad upward fire currents stay within the orange forest on either side.
    float fireArea=max(oval(p,vec2(0.835,0.330),vec2(0.22,0.26)),
                       oval(p,vec2(0.124,0.410),vec2(0.15,0.15)));
    float orange=smoothstep(0.045,0.20,original.r-original.b);
    float flow=sin(p.y*62.0+t*3.4+sin(p.x*22.0-t*1.2)*2.0);
    color*=1.0+0.14*flow*fireArea*orange*background;
    float ribbonX=0.82+0.045*sin(p.y*25.0+t*1.6)+0.018*sin(p.y*60.0-t*2.0);
    float ribbon=exp(-pow((p.x-ribbonX)/0.018,2.0));
    float tongues=0.45+0.55*pow(0.5+0.5*sin(p.y*45.0+t*3.8),3.0);
    color+=vec3(0.28,0.075,0.006)*ribbon*tongues*fireArea*background;

    float pulse=0.62+0.38*sin(t*3.5+seed);
    float hand=oval(p,palm,vec2(0.065,0.047));
    color+=vec3(0.38,0.19,0.018)*hand*pulse;
    // A bright packet follows the kinked lightning path from the actual palm
    // to the branch. Its tail visibly crosses the illustration at listing size.
    float charge=0.0;
    float phase=fract(t*0.54+seed);
    for(int i=0;i<10;i++) {
        float f=float(i);
        float s0=f/10.0;
        float s1=(f+1.0)/10.0;
        vec2 a=mix(palm,vec2(0.847,0.239),s0);
        vec2 b=mix(palm,vec2(0.847,0.239),s1);
        a.y+=sin(f*2.7)*0.016*sin(s0*3.141593);
        b.y+=sin((f+1.0)*2.7)*0.016*sin(s1*3.141593);
        float packet=exp(-pow((s0-phase*1.35+0.10)/0.19,2.0));
        charge+=(1.0-smoothstep(0.0025,0.006+aa,segment(p,a,b)))*packet;
    }
    color+=vec3(0.54,0.32,0.055)*charge*(1.0-face);

    // Three discrete defensive waves bloom below/right of the casting hand.
    float wards=0.0;
    for(int i=0;i<3;i++) {
        float age=fract(t*0.24+float(i)/3.0+seed);
        vec2 q=(p-palm)*vec2(1.0,1.42);
        float radius=0.048+age*0.30;
        float ring=1.0-smoothstep(0.002,0.005+aa,abs(length(q)-radius));
        float sector=smoothstep(-0.015,0.055,q.x)*(1.0-smoothstep(0.03,0.12,-q.y));
        float breath=sin(age*3.141593);
        wards+=ring*sector*breath;
    }
    color+=vec3(0.36,0.22,0.043)*wards*(1.0-face);

    // Rising sparks originate in the forest and spiral off the charged palm.
    float sparks=0.0;
    for(int i=0;i<20;i++) {
        float f=float(i);
        float age=fract(t*(0.18+0.08*hash(f+8.0))+hash(f+seed+2.0));
        float side=step(0.35,hash(f+3.0));
        vec2 e=vec2(mix(0.10,0.69,side)+hash(f+4.0)*0.22,0.54-age*0.38);
        e.x+=sin(age*7.0+f+t*0.7)*0.023;
        vec2 tail=e+vec2(-0.005,0.012+0.010*hash(f));
        float spark=1.0-smoothstep(0.0015,0.004+aa,segment(p,e,tail));
        sparks+=spark*sin(age*3.141593);
    }
    color+=vec3(0.59,0.27,0.035)*sparks*background;

    if(u_is_foil) {
        // Copper hair, gold ornaments, and oil-slick flame interference are
        // present at t=0 as well as during the animated diagonal metal glint.
        float luma=dot(original.rgb,vec3(0.2126,0.7152,0.0722));
        float metal=smoothstep(0.10,0.57,luma)*orange;
        float phaseFoil=p.x*2.6+p.y*2.0+0.14*sin(p.y*21.0)+t*0.12+seed;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phaseFoil+vec3(0.0,0.33,0.67)));
        vec3 overlay=mix(2.0*color*spectrum,
                        1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        color=mix(color,overlay,(0.29+0.25*metal)*(1.0-face*0.95));
        float sheen=pow(0.5+0.5*sin(p.x*15.0-p.y*12.0-t*1.9),12.0);
        color+=(1.0-color)*spectrum*sheen*(0.16+0.25*metal)*(1.0-face);
        color+=vec3(0.08,0.20,0.24)*wards;
    }
    gl_FragColor=vec4(clamp(mix(original.rgb,color,art),0.0,1.0),original.a);
}
