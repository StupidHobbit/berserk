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

// Магистр Шарль: the red throwing flask brews above his palm while
// the rotten staff releases green life. Anchors follow the base 496x700 scan.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.25,1.0,length((p-c)/r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 q=(p-a)*vec2(1.0,1.4113);
    vec2 v=(b-a)*vec2(1.0,1.4113);
    return length(q-v*clamp(dot(q,v)/max(dot(v,v),0.000001),0.0,1.0));
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 base=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173);
    float art=smoothstep(0.142,0.153,p.y)*(1.0-smoothstep(0.544,0.554,p.y));
    art*=smoothstep(0.007,0.018,p.x)*(1.0-smoothstep(0.981,0.994,p.x));
    // Shield badge and every frame, label, statistic and rule remain original.
    art*=smoothstep(1.0,1.15,length((p-vec2(0.110,0.183))/vec2(0.065,0.043)));
    vec3 color=base.rgb;
    float pulse=0.5+0.5*sin(t*1.7+seed*6.28318);
    float face=oval(p,vec2(0.480,0.285),vec2(0.080,0.082));
    float flask=oval(p,vec2(0.577,0.360),vec2(0.056,0.039));
    float redGlass=smoothstep(0.025,0.19,base.r-max(base.g,base.b)*0.80);
    float liquid=flask*(0.25+0.75*redGlass);
    color+=(1.0-color)*vec3(0.70,0.025,0.14)*liquid*(0.38+0.32*pulse);
    // Alchemical bubbles rise through the painted crimson liquid.
    float bubbles=0.0;
    for(int i=0;i<7;i++) {
        float n=float(i);
        float age=fract(t*(0.24+n*0.009)+n*0.143+seed*0.2);
        vec2 c=vec2(0.577+0.028*sin(n*2.4+age*3.0),0.382-age*0.047);
        float d=length((p-c)*vec2(1.0,1.4113));
        float radius=0.0025+age*0.0025;
        float ring=1.0-smoothstep(0.0007,0.0018+aa,abs(d-radius));
        bubbles+=ring*sin(age*3.14159);
    }
    color+=vec3(0.75,0.25,0.38)*bubbles*flask*0.70;
    float palm=oval(p,vec2(0.576,0.402),vec2(0.079,0.035));
    color+=vec3(0.17,0.013,0.035)*palm*(0.65+0.35*pulse);

    // A slow ribbon escapes the bottle neck, bending away from the beak.
    float h=clamp((0.321-p.y)/0.125,0.0,1.0);
    float vaporX=0.606+0.035*h+0.020*sin(h*8.0-t*1.15)*h;
    float vaporWidth=0.006+0.014*h;
    float vapor=exp(-pow((p.x-vaporX)/vaporWidth,2.0));
    vapor*=smoothstep(0.196,0.225,p.y)*(1.0-smoothstep(0.311,0.328,p.y));
    vapor*=0.52+0.48*pow(0.5+0.5*sin(h*15.0-t*2.1),2.0);
    color+=(1.0-color)*vec3(0.52,0.09,0.30)*vapor*0.46;

    // Poison follows the existing twisted head of the staff, not the frame.
    float staffGlow=0.0;
    float staffCore=0.0;
    for(int i=0;i<20;i++) {
        float s=float(i)/20.0;
        float sn=(float(i)+1.0)/20.0;
        vec2 a=vec2(0.200+0.020*sin(s*13.0),mix(0.222,0.354,s));
        vec2 b=vec2(0.200+0.020*sin(sn*13.0),mix(0.222,0.354,sn));
        float d=segment(p,a,b);
        float flow=0.35+0.65*pow(0.5+0.5*sin(s*18.0+t*2.4+seed*6.0),3.0);
        staffGlow=max(staffGlow,exp(-d*d/0.00045)*flow);
        staffCore=max(staffCore,(1.0-smoothstep(0.001,0.003+aa,d))*flow);
    }
    color+=(1.0-color)*vec3(0.22,0.69,0.24)*staffGlow*0.42;
    color+=vec3(0.24,0.42,0.09)*staffCore*0.45;
    float spores=0.0;
    for(int i=0;i<8;i++) {
        float n=float(i);
        float age=fract(t*0.12+n*0.125+seed*0.33);
        vec2 c=vec2(0.199+sin(n*2.399+age*5.0)*(0.012+age*0.045),0.274-age*0.116);
        float d=length((p-c)*vec2(1.0,1.4113));
        spores+=(1.0-smoothstep(0.001,0.004+aa,d))*sin(age*3.14159);
    }
    color+=vec3(0.36,0.70,0.19)*spores*0.63;
    // Red lenses reflect the brew without painting over the doctor's mask.
    float lenses=oval(p,vec2(0.448,0.250),vec2(0.018,0.010))
                +oval(p,vec2(0.507,0.241),vec2(0.016,0.010));
    color+=vec3(0.27,0.023,0.055)*lenses*(0.65+0.35*pulse);

    if(u_is_foil) {
        float coat=oval(p,vec2(0.578,0.439),vec2(0.267,0.203));
        float hat=oval(p,vec2(0.457,0.205),vec2(0.170,0.062));
        float metal=clamp(0.30+coat*0.52+hat*0.40+flask*0.50,0.0,0.95)*(1.0-face*0.90);
        float phase=p.x*1.9+p.y*2.7+0.10*sin(p.y*28.0+p.x*9.0)-t*0.10+seed*0.23;
        vec3 spectrum=0.5+0.5*cos(6.28318*(phase+vec3(0.0,0.333,0.667)));
        vec3 overlay=mix(2.0*color*spectrum,1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        color=mix(color,overlay,metal*0.48);
        float sheen=pow(0.5+0.5*sin(p.x*16.0+p.y*20.0-t*1.05),8.0);
        vec3 silver=mix(vec3(0.65,0.85,0.89),spectrum,0.54);
        color+=(1.0-color)*silver*metal*(0.14+0.39*sheen);
        float glassEdge=abs(length((p-vec2(0.577,0.360))/vec2(0.045,0.032))-0.88);
        color+=vec3(0.42,0.52,0.46)*(1.0-smoothstep(0.025,0.12+aa*12.0,glassEdge))*flask*(0.40+0.35*sheen);
    }
    gl_FragColor=vec4(mix(base.rgb,clamp(color,0.0,1.0),art),base.a);
}
