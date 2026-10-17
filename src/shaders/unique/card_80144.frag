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
float oval(vec2 p,vec2 c,vec2 r){return 1.0-smoothstep(0.35,1.0,length((p-c)/r));}
float badge(vec2 p,vec2 c,vec2 r){return smoothstep(1.0,1.15,length((p-c)/r));}
vec2 pullPath(float s){
    vec2 a=vec2(0.815,0.403), b=vec2(0.514,0.467), c=vec2(0.355,0.273);
    return mix(mix(a,b,s),mix(b,c,s),s);
}
void main(){
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 original=texture2D(u_card,v_uv);
    float px=1.0/max(u_resolution.x,1.0);
    float aa=max(px,1.4113/max(u_resolution.y,1.0));
    float t=max(0.0,u_time), seed=fract(u_seed*0.137)*6.2831853;
    // Upper frame/class strip, side ability medals and all lower printing stay exact.
    float art=smoothstep(0.140,0.155,p.y)*(1.0-smoothstep(0.540,0.559,p.y));
    art*=smoothstep(0.018,0.038,p.x)*(1.0-smoothstep(0.962,0.985,p.x));
    art*=badge(p,vec2(0.106,0.178),vec2(0.061,0.040));
    art*=badge(p,vec2(0.107,0.259),vec2(0.060,0.040));
    art*=badge(p,vec2(0.108,0.339),vec2(0.061,0.040));
    art*=badge(p,vec2(0.149,0.367),vec2(0.031,0.025));
    art*=badge(p,vec2(0.885,0.075),vec2(0.088,0.075));
    if(art<=0.0){gl_FragColor=original;return;}
    vec3 color=original.rgb;
    float lum=dot(color,vec3(0.2126,0.7152,0.0722));
    float face=oval(p,vec2(0.496,0.212),vec2(0.057,0.065));
    float captive=oval(p,vec2(0.810,0.337),vec2(0.045,0.040));
    vec2 lamp=vec2(0.353,0.273);
    float flicker=0.65+0.21*sin(t*3.5+seed)+0.14*sin(t*8.2);
    float lampHalo=oval(p,lamp,vec2(0.113,0.083));
    color+=(1.0-color)*vec3(0.28,0.52,0.025)*lampHalo*flicker;
    // The green lure sends visible hooked wisps around the painted antlers.
    float flame=0.0;
    for(int i=0;i<9;i++){
        float fi=float(i), age=fract(t*0.27+fi/9.0+seed*0.03);
        vec2 q=lamp+vec2(sin(age*7.5+fi*2.4+t*0.7)*(.009+age*.052),-age*.100);
        float d=length((p-q)*vec2(1.0,1.4113));
        flame+=exp(-d*d/(0.000027+aa*0.0018))*sin(age*3.14159265);
    }
    color+=vec3(0.32,0.56,0.065)*flame;
    // Capturing magic travels from the actual captive, beneath the troll's fist,
    // toward the green bait. Several bright heads and dim tails remain legible small.
    float threads=0.0, heads=0.0;
    for(int i=0;i<24;i++){
        float s=float(i)/24.0;
        vec2 a=pullPath(s), b=pullPath(s+1.0/24.0);
        a.y+=sin(s*15.0-t*2.5+seed)*sin(s*3.14159265)*0.009;
        b.y+=sin((s+1.0/24.0)*15.0-t*2.5+seed)*sin((s+1.0/24.0)*3.14159265)*0.009;
        vec2 v=(b-a)*vec2(1.0,1.4113), q=(p-a)*vec2(1.0,1.4113);
        float f=clamp(dot(q,v)/max(dot(v,v),0.000001),0.0,1.0);
        float d=length(q-f*v), pos=s+f/24.0;
        float cycle=fract(pos*3.0-t*0.61+seed*0.08);
        float moving=pow(cycle,11.0);
        threads=max(threads,(1.0-smoothstep(0.001,0.003+aa,d))*(0.08+0.74*moving));
        heads=max(heads,exp(-d*d/0.00010)*moving);
    }
    color+=vec3(0.15,0.49,0.28)*threads+vec3(0.06,0.17,0.03)*heads;
    // Regeneration pulses climb the gripping forearm and shoulder.
    float arm=oval(p,vec2(0.500,0.331),vec2(0.103,0.100));
    float back=oval(p,vec2(0.666,0.231),vec2(0.155,0.099));
    float skin=clamp(arm+back,0.0,1.0)*(1.0-face);
    float pulse=pow(0.5+0.5*sin(p.y*67.0+p.x*25.0+t*3.3+seed),10.0);
    color+=(1.0-color)*vec3(0.055,0.27,0.16)*skin*pulse;
    // Low forest fog drifts through the exposed right edge, behind the prisoner.
    float fogRegion=oval(p,vec2(0.944,0.452),vec2(0.104,0.102));
    float fog=pow(0.5+0.5*sin(p.y*104.0+sin(p.x*23.0-t*1.2)*1.8+t*2.4),5.0);
    color+=vec3(0.015,0.115,0.13)*fog*fogRegion;
    if(u_is_foil){
        float horn=oval(p,vec2(0.323,0.303),vec2(0.133,0.124));
        float headpiece=oval(p,vec2(0.864,0.193),vec2(0.103,0.080));
        float finish=clamp(skin*0.95+horn*0.64+headpiece*0.8,0.0,1.0);
        finish*=smoothstep(0.075,0.34,lum)*(1.0-captive);
        float phase=p.x*3.8+p.y*4.8-t*0.18+seed*0.08;
        vec3 spectral=0.5+0.5*cos(6.2831853*(phase+vec3(0.02,0.34,0.64)));
        float streak=pow(0.5+0.5*sin(phase*6.2831853),13.0);
        color*=1.0-finish*0.18;
        color+=(1.0-color)*mix(vec3(0.28,0.68,0.47),spectral,0.75)*finish*(0.39+0.72*streak);
        // Colored foil substrate gives a distinct stationary edition at time zero.
        vec3 hue=0.5+0.5*cos(6.2831853*(p.x*1.45+p.y*1.2-t*0.09+seed*0.04+vec3(0.0,0.33,0.67)));
        vec3 overlay=mix(2.0*color*hue,1.0-2.0*(1.0-color)*(1.0-hue),step(vec3(0.5),color));
        color=mix(color,overlay,0.25*(1.0-captive*0.7));
    }
    gl_FragColor=vec4(mix(original.rgb,clamp(color,0.0,1.0),art),original.a);
}
